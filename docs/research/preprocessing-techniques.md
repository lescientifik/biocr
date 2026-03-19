---
description: Comprehensive survey of image preprocessing techniques to maximize Tesseract OCR accuracy, with feasibility analysis for pure TypeScript/Canvas API implementation.
---

# Image Preprocessing Techniques for OCR Accuracy

This report surveys the state of the art in image preprocessing for Tesseract OCR, covering ten key technique categories. For each technique we assess how it works, when it helps, whether it can be implemented in pure TypeScript with the Canvas API (no native OpenCV dependency), and the expected impact on recognition accuracy.

## Table of Contents

1. [Deskewing](#1-deskewing)
2. [Noise Removal](#2-noise-removal)
3. [Binarization](#3-binarization)
4. [Contrast Enhancement](#4-contrast-enhancement)
5. [Upscaling](#5-upscaling)
6. [Border Removal](#6-border-removal)
7. [Text Line Detection](#7-text-line-detection)
8. [Color Space](#8-color-space)
9. [Sharpening](#9-sharpening)
10. [Pipeline Ordering](#10-pipeline-ordering)

---

## 1. Deskewing

### How it works

Deskewing detects the rotation angle of a scanned document and rotates it back to horizontal alignment. The two dominant detection strategies are:

- **Hough Transform**: Detect line segments in a binarized image, accumulate their angles in Hough space, and pick the dominant angle. Robust but computationally heavier.
- **Horizontal Projection Profile**: For each candidate angle (e.g. -15 to +15 degrees in 0.1-degree increments), rotate the image, compute the horizontal projection (sum of black pixels per row), and select the angle that maximizes the variance of the projection. Simpler, faster, and works well for printed text.

A third emerging approach uses **deep learning** for skew estimation, achieving 98.5% skew correction accuracy and 99.1% OCR precision, but requires a trained model.

### When to use it

- Scanned documents where the page was not perfectly aligned on the scanner.
- Photographs of documents taken at an angle.
- Any input where text lines are not horizontal. Even 1-2 degrees of skew degrades line segmentation and character recognition.

### TypeScript/Canvas feasibility

**Feasible.** The projection profile method is straightforward:
1. Binarize the image (simple threshold on `ImageData` pixels).
2. For each candidate angle, compute a rotated projection by iterating over pixel rows. A full affine rotation per candidate is expensive, but a shearing approximation or direct trigonometric mapping of row indices keeps it fast.
3. Pick the angle with maximum projection variance.
4. Apply the final rotation via `ctx.rotate()` on a canvas.

The Hough Transform is more complex but also implementable purely in JS -- libraries like `jsfeat` have demonstrated this.

### Expected impact on OCR accuracy

**High.** Deskewing alone can improve accuracy by up to 10%. Tesseract's own documentation states that skewed pages "severely impact" OCR quality because line segmentation fails when text is not horizontal.

---

## 2. Noise Removal

### How it works

Noise manifests as random brightness/color variations (salt-and-pepper, Gaussian, speckle) that survive binarization and confuse character recognition. Key denoising methods:

| Method | Mechanism | Pros | Cons |
|---|---|---|---|
| **Median filter** | Replaces each pixel with the median of its neighborhood (e.g., 3x3). | Excellent for salt-and-pepper noise; preserves edges well. | Does not handle Gaussian noise as well; limited to small kernel sizes. |
| **Gaussian blur** | Weighted averaging with a Gaussian kernel. | Simple, fast. | Blurs edges and fine text details. |
| **Bilateral filter** | Gaussian weighting in both spatial and intensity domains. | Preserves edges while smoothing flat regions. | Computationally expensive (O(n^2 * k^2) per pixel for kernel size k). |
| **Non-local means** | Averages pixels weighted by patch similarity across the entire image. | Best denoising quality; preserves texture and edges. | Very computationally expensive; impractical in real-time JS. |
| **Morphological opening** | Erosion followed by dilation with a structuring element. | Removes small isolated noise dots. | Can erode thin strokes if kernel is too large. |

### When to use it

- Scanned documents with visible speckle or dust artifacts.
- Photographs taken in low light (Gaussian noise).
- Faxed or photocopied documents (salt-and-pepper noise).
- **Not** needed for clean, high-resolution digital PDFs.

### TypeScript/Canvas feasibility

**Feasible for median, Gaussian, bilateral, and morphological filters.** All operate on `ImageData` pixel arrays with neighborhood lookups. Performance considerations:

- **Median filter (3x3, 5x5)**: Straightforward. Sorting a 9- or 25-element array per pixel is fast.
- **Gaussian blur**: Can use a separable two-pass approach (horizontal then vertical) for O(n*k) instead of O(n*k^2).
- **Bilateral filter**: Feasible but slow for large kernels. A 5x5 kernel is practical; larger requires WebWorkers.
- **Non-local means**: Likely too slow for interactive use without WebAssembly. Not recommended for pure TS.
- **Morphological operations**: Simple min/max over structuring element neighborhoods.

### Expected impact on OCR accuracy

**Medium to High.** Studies show noise removal can improve OCR accuracy by 5-15% on noisy inputs. Median filtering is the best bang-for-buck for scanned documents. Bilateral filtering gives superior edge preservation but at higher compute cost.

---

## 3. Binarization

### How it works

Binarization converts a grayscale image to pure black and white. This is the single most impactful preprocessing step -- removing it causes up to 40% accuracy drops.

| Method | Type | Mechanism | Best for |
|---|---|---|---|
| **Simple threshold** | Global | Compare every pixel to a fixed value (e.g., 128). | Clean documents with uniform background. |
| **Otsu** | Global | Automatically finds the threshold that minimizes intra-class variance. Used internally by Tesseract. | Documents with bimodal histogram (clear text/background separation). |
| **Adaptive (mean/Gaussian)** | Local | Threshold computed over a local window around each pixel. | Documents with gradual lighting gradients. |
| **Niblack** | Local | Threshold = local_mean + k * local_stddev. k is typically -0.2. | Recovers text well from degraded images. Produces significant background noise. |
| **Sauvola** | Local | Modification of Niblack: threshold = local_mean * (1 + k * (local_stddev/R - 1)). R is dynamic range (128 for 8-bit). k typically 0.2-0.5. | Uneven lighting, stained documents. Less noise than Niblack. |
| **Wolf** | Local | Normalizes Sauvola by min intensity and contrast. | Very degraded documents with low contrast. |

**Key findings from research:**

- For **severely degraded** documents: Niblack achieves 47.92% F-measure vs Sauvola 42.38% vs Otsu 36.80%. None is great alone -- hybrid approaches work best.
- Sauvola handles ink bleed-through but can produce broken characters.
- Niblack recovers text well but introduces heavy background noise.
- **Tesseract 5.0+** added built-in Adaptive Otsu and Sauvola binarization methods, configurable via `thresholding_method` parameter.

### When to use it

Always. Binarization is essential. The question is *which* method:
- Clean scans with even lighting: Otsu (or let Tesseract handle it internally).
- Uneven lighting, shadows, stains: Sauvola or adaptive thresholding.
- Severely degraded historical documents: Consider a two-stage approach (Niblack for text recovery + morphological cleanup for noise removal).

### TypeScript/Canvas feasibility

**Fully feasible.** All methods operate per-pixel with local window statistics:

- **Otsu**: Single pass to build histogram (256 bins), then optimize threshold. Trivial.
- **Adaptive threshold**: Compute running mean/sum over a sliding window using integral images (summed area tables) for O(1) per-pixel lookup. This is the key optimization.
- **Sauvola/Niblack**: Require both local mean and local standard deviation. Use integral images for the sum and sum-of-squares to compute both in O(1) per pixel.
- Window size: Typically 15-51 pixels. Must be tuned to roughly match character stroke width.

### Expected impact on OCR accuracy

**Critical / High.** Removing binarization drops accuracy by ~40%. Switching from Otsu to adaptive/Sauvola on uneven documents yields ~10% improvement.

---

## 4. Contrast Enhancement

### How it works

Contrast enhancement improves the separation between text (foreground) and background, making subsequent binarization more effective.

**Histogram Equalization (HE):** Redistributes pixel intensities to span the full dynamic range. Simple but can amplify noise and wash out text on documents with large uniform backgrounds.

**CLAHE (Contrast Limited Adaptive Histogram Equalization):** Divides the image into tiles (default 8x8 grid), applies histogram equalization within each tile, clips the histogram at a configurable limit to prevent noise amplification, and interpolates between tiles to avoid block artifacts.

Key CLAHE parameters:
- **Clip limit**: Controls maximum contrast amplification. Default 40; for OCR documents, values of 2-4 work well. Higher values = more contrast but more noise.
- **Tile grid size**: Default 8x8. Larger tiles = more global effect; smaller = more local adaptation.

### When to use it

- Documents with uneven lighting (e.g., photographed pages with shadows).
- Faded or low-contrast scans.
- **Not** recommended for already well-contrasted documents -- can degrade quality by amplifying scanner noise.

### TypeScript/Canvas feasibility

**Feasible.** CLAHE implementation steps:
1. Divide image into tiles.
2. Compute histogram for each tile (256 bins, simple counting).
3. Clip histogram: redistribute excess counts above clip limit evenly.
4. Compute CDF (cumulative distribution function) per tile for the equalization mapping.
5. For each pixel, bilinearly interpolate the mapping from the four surrounding tile centers.

This is O(n) overall and well-suited to typed arrays. A pure TypeScript CLAHE is entirely practical.

### Expected impact on OCR accuracy

**Medium to High.** Up to 15% improvement on low-contrast or unevenly lit documents. Research shows contrast adjustment can improve recognition accuracy by up to 9% even for basic techniques. CLAHE is particularly effective as a pre-binarization step.

---

## 5. Upscaling

### How it works

Tesseract works best at 300 DPI or higher, with capital letters at least 20 pixels tall. Low-resolution inputs (e.g., 72-150 DPI screenshots, thumbnails) benefit from upscaling.

| Method | Mechanism | Quality | Speed |
|---|---|---|---|
| **Nearest neighbor** | Copy nearest pixel. | Blocky, poor for text. | Fastest. |
| **Bilinear** | Weighted average of 4 neighbors. | Smooth but blurry. | Fast. |
| **Bicubic** | Weighted average of 16 neighbors (4x4 grid). | Sharper than bilinear, slight ringing. | Moderate. |
| **Lanczos** | Sinc-based kernel, typically Lanczos-3 (6x6 neighborhood). | Sharpest of classical methods, minimal aliasing. | Slower. |
| **AI/Super-resolution** | Neural networks (ESRGAN, Real-ESRGAN, etc.) that hallucinate high-frequency detail. | Can reconstruct character shapes, impressive results. | Very slow without GPU. |

**Research findings:**
- Upscaling from 60 DPI with proper super-resolution achieves 99.7% character accuracy and 98.9% word accuracy.
- Simple interpolation (bilinear, bicubic) produces blurry output that may not help OCR.
- Lanczos is the best classical method: sharpest result with least aliasing.
- AI upscaling can genuinely reconstruct text detail, but requires model inference.

### When to use it

- Input below 200 DPI.
- Screenshots or web-captured images.
- **Do not** upscale images that are already 300+ DPI -- it wastes computation and can amplify noise.
- Upscaling factor of 2x is usually sufficient; 4x yields diminishing returns with classical methods.

### TypeScript/Canvas feasibility

**Partially feasible.**
- **Bilinear**: Built into Canvas via `ctx.drawImage()` with `imageSmoothingQuality = "low"`.
- **Bicubic**: Available via `imageSmoothingQuality = "medium"` or `"high"` (browser-dependent, typically bicubic or similar).
- **Lanczos**: Not natively available in Canvas. Must be implemented manually by iterating over pixels with a Lanczos kernel. Feasible but slow for large images. Libraries like `pica` (pure JS) provide optimized Lanczos resizing.
- **AI upscaling**: Requires ONNX Runtime or TensorFlow.js. Feasible but adds significant bundle size and latency.

### Expected impact on OCR accuracy

**High for low-res inputs.** Going from 72 DPI to 300 DPI can be the difference between 0% and 95%+ accuracy. Tesseract simply cannot recognize text below a certain resolution. For inputs already at 300+ DPI, upscaling provides no benefit.

---

## 6. Border Removal

### How it works

Scanned documents often have dark borders from the scanner lid, page edges, or binding shadows. These borders can be misidentified as characters or interfere with layout analysis.

Detection approaches:
1. **Edge scanning**: Walk inward from each image edge, detect transition from dark to light region. The transition point marks the document boundary.
2. **Connected component analysis**: Find large dark connected components touching the image edges; remove them.
3. **Contour detection**: Find the largest rectangular contour in the image; crop to it.
4. **Projection analysis**: Compute row/column projections; border regions have consistently high (dark) values.

### When to use it

- Any flatbed-scanned document (nearly all have some border artifacts).
- Book scans with binding shadows.
- Multi-page batch processing where border characteristics vary.

### TypeScript/Canvas feasibility

**Feasible.** The edge-scanning approach is simplest:
1. Convert to grayscale.
2. From each edge (top, bottom, left, right), scan inward row-by-row (or column-by-column).
3. For each row/column, compute mean brightness. When it exceeds a threshold (e.g., mean > 200 for white paper), mark it as the document boundary.
4. Crop via `ctx.drawImage(source, sx, sy, sw, sh, 0, 0, sw, sh)`.

Research shows border removal reduces OCR error rates from 4.3% to 1.7% (a 60% error reduction) by eliminating textual noise in margins.

### Expected impact on OCR accuracy

**Medium to High.** Impact is indirect: borders confuse Tesseract's page layout analysis (PSM), leading to garbage characters and incorrect reading order. Removing them cleans up the layout analysis step significantly.

---

## 7. Text Line Detection

### How it works

Rather than feeding an entire page to Tesseract, segmenting it into individual text regions or lines can improve accuracy -- especially for complex layouts (multi-column, mixed text/images).

| Method | Mechanism |
|---|---|
| **Horizontal projection profile** | Sum black pixels per row; valleys (minima) between peaks indicate line boundaries. Simple and effective for well-separated horizontal text. |
| **Connected component analysis (CCA)** | Find connected components, compute bounding boxes, group nearby components into lines based on spatial proximity and alignment. Works for arbitrary layouts. |
| **Morphological dilation** | Dilate the binarized image horizontally to merge characters into continuous text blobs, then find contours of those blobs. Fast approximation of CCA. |
| **Run-length smoothing (RLSA)** | Similar to dilation: merge nearby black runs horizontally to form text blocks. Classic technique, simple to implement. |

### When to use it

- Multi-column documents.
- Pages with mixed content (text, tables, images, headers, footers).
- When Tesseract's built-in layout analysis (via PSM modes) gives poor results.
- **Not needed** for single-column, text-only documents -- Tesseract handles these well internally.

### TypeScript/Canvas feasibility

**Feasible.** Horizontal projection profile is trivial to compute from a binarized `ImageData`. CCA requires a flood-fill or union-find algorithm, which is more involved but well-documented and O(n) in pixel count. Morphological dilation is also straightforward.

The main challenge is performance for large images (e.g., 3000x4000 pixels = 12M pixels). WebWorkers can help.

### Expected impact on OCR accuracy

**Medium.** Most benefit comes from preventing layout analysis errors. For single-column documents, Tesseract's internal segmentation is usually adequate. For complex layouts, pre-segmentation can prevent entire columns from being missed or interleaved.

---

## 8. Color Space

### How it works

OCR engines work on grayscale or binary images. The conversion path from color matters.

| Color space | Relevance to OCR |
|---|---|
| **RGB -> Grayscale** | Standard conversion: `Y = 0.2126*R + 0.7152*G + 0.0722*B` (ITU-R BT.709). This is what Tesseract does internally. Works well for most documents. |
| **LAB (L channel)** | The L (lightness) channel is perceptually uniform and separates luminance from chrominance. Can provide better contrast for colored text on colored backgrounds (e.g., red text on blue). |
| **HSV (V channel)** | The Value channel represents brightness. Similar use case to LAB L channel but less perceptually uniform. |

**Research findings:**
- Grayscale is the recommended color mode for OCR in the vast majority of cases.
- For **older, discolored, or stained** documents, capturing in full RGB and then preprocessing (e.g., contrast enhancement) before grayscale conversion preserves more detail than scanning directly in grayscale.
- LAB L channel is theoretically superior for perceptual contrast but in practice offers marginal improvement over standard grayscale for typical printed text.
- Using the wrong grayscale formula (e.g., simple averaging `(R+G+B)/3`) can reduce contrast for colored text. Always use the luminance-weighted formula.

### When to use it

- **Default**: Standard grayscale conversion (luminance-weighted). Let Tesseract handle it.
- **Colored text on colored backgrounds**: Extract the LAB L channel to maximize contrast.
- **Stained/aged documents**: Work in full RGB, apply CLAHE per-channel or on the L channel in LAB space, then convert to grayscale.

### TypeScript/Canvas feasibility

**Fully feasible.** Grayscale conversion is a per-pixel operation on `ImageData`. RGB-to-LAB conversion requires intermediate conversion to XYZ color space (matrix multiplication + gamma correction per pixel) -- more math but still O(n) and straightforward.

### Expected impact on OCR accuracy

**Low to Medium.** For standard black-text-on-white-paper documents, color space choice barely matters. For colored or degraded documents, proper LAB-based enhancement can yield up to 9% improvement.

---

## 9. Sharpening

### How it works

Sharpening enhances edge contrast, making character boundaries crisper for the OCR engine.

**Unsharp Mask (USM):** The standard approach.
1. Blur the image with a Gaussian kernel (radius R).
2. Subtract the blurred image from the original to get the "detail mask."
3. Add the detail mask back, scaled by an amount factor A.
4. Result: `sharpened = original + A * (original - blurred)`

Typical parameters for OCR: Amount = 1.0-1.5, Radius = 0.5-1.0, Threshold = 0 (no threshold).

**Laplacian sharpening:** Convolve with a Laplacian kernel (edge detector), add the result back to the original. Simpler but less controllable; tends to amplify noise more than USM.

### When to use it

- Slightly out-of-focus scans.
- Scans that appear "soft" after upscaling.
- **Caution**: Over-sharpening creates halo artifacts (light/dark fringes around characters) that can break character segmentation. Sharpening should be subtle.
- **Not recommended** for already sharp images or for images with significant noise (sharpening amplifies noise).

### TypeScript/Canvas feasibility

**Fully feasible.** USM is implemented as:
1. Apply Gaussian blur (separable, already covered in noise removal).
2. Per-pixel subtraction and scaling -- trivial on `ImageData`.

The Canvas API also has a native `filter: "blur()"` CSS property that can be used for the blur step, though pixel-level control via `ImageData` is preferred for precision.

### Expected impact on OCR accuracy

**Low.** Research from the GovInfo OCR optimization study found that unsharp mask "didn't reduce OCR accuracy rates, but didn't significantly improve them either." Sharpening helps most when the input is genuinely soft/blurry. For already-sharp scans, it provides no benefit and risks harm from halo artifacts. It is a situational tool, not a default pipeline step.

---

## 10. Pipeline Ordering

### Recommended preprocessing pipeline

Based on the literature, the optimal ordering is:

```
1. Border removal
2. Deskewing
3. Color space conversion (to grayscale, or LAB L-channel extraction)
4. Upscaling (if DPI < 300)
5. Noise removal (median filter or bilateral filter)
6. Contrast enhancement (CLAHE)
7. Sharpening (optional, only for soft inputs)
8. Binarization (Sauvola/adaptive for uneven lighting, Otsu for clean scans)
9. Morphological cleanup (optional: remove isolated dots, fill small gaps)
10. Text region segmentation (optional: for complex layouts)
```

### Rationale for this order

1. **Border removal first**: Dark borders interfere with all subsequent histogram-based operations (Otsu, CLAHE, etc.) by skewing the intensity distribution.
2. **Deskewing before pixel-level processing**: Rotation after binarization introduces aliasing artifacts. Rotate on the grayscale/color image for better interpolation.
3. **Grayscale conversion**: Reduces data from 3 channels to 1, speeding up all subsequent steps.
4. **Upscaling before denoising**: Upscaling can introduce artifacts; denoising afterward cleans them up. Also, denoising at the target resolution preserves more detail.
5. **Noise removal before contrast enhancement**: CLAHE amplifies local contrast, which would amplify noise if not removed first.
6. **CLAHE before binarization**: Improved contrast makes the binarization threshold more reliable, especially for Otsu.
7. **Sharpening before binarization**: Sharpening operates on grayscale gradients; after binarization there are no gradients left.
8. **Binarization last** (among pixel transforms): This is the final preparation before OCR. Tesseract also applies its own internal binarization, but pre-binarizing with a better algorithm (Sauvola) avoids relying on Tesseract's default Otsu.
9. **Morphological cleanup**: Post-binarization cleanup to remove isolated noise pixels or fill small gaps in character strokes.
10. **Segmentation**: Operates on the final binarized image to detect text regions.

### Adaptive pipeline

Not all steps are always needed. A practical approach:

| Input quality | Steps to apply |
|---|---|
| Clean 300 DPI scan, even lighting | Minimal: border removal + deskewing. Let Tesseract handle the rest. |
| Low-res screenshot (72-150 DPI) | Upscaling (Lanczos 2x-4x) + light denoising + binarization. |
| Uneven lighting (photo of document) | Grayscale + CLAHE + Sauvola binarization. |
| Noisy/degraded scan | Full pipeline: border removal, deskew, denoise, CLAHE, Sauvola. |
| Multi-column/complex layout | Full pipeline + text region segmentation. |

### Performance budget

For a browser-based TypeScript pipeline processing a 3000x4000 image (~12M pixels):

| Step | Estimated time (single-threaded JS) |
|---|---|
| Grayscale conversion | ~15 ms |
| Simple threshold | ~10 ms |
| Otsu binarization | ~20 ms |
| Sauvola (with integral image) | ~50-80 ms |
| Median filter 3x3 | ~60-100 ms |
| Gaussian blur (separable) | ~30-50 ms |
| CLAHE (8x8 tiles) | ~40-60 ms |
| Upscaling 2x (bilinear via Canvas) | ~20 ms (GPU-accelerated) |
| Deskew detection (projection) | ~100-200 ms |
| Rotation (Canvas) | ~10 ms (GPU-accelerated) |

Total for a full pipeline: roughly **300-600 ms**, well within interactive latency budgets. Using WebWorkers for the heavy steps (Sauvola, median filter) keeps the main thread responsive.

---

## Summary Table

| Technique | Impact | Canvas/TS feasibility | Default in pipeline? |
|---|---|---|---|
| Deskewing | High (up to 10%) | Yes | Yes |
| Noise removal (median) | Medium-High (5-15%) | Yes | Conditional |
| Binarization (Sauvola) | Critical (~40% if omitted) | Yes (integral images) | Yes |
| Contrast (CLAHE) | Medium-High (up to 15%) | Yes | Conditional |
| Upscaling | High for low-res | Partial (Lanczos needs manual impl or `pica`) | Conditional |
| Border removal | Medium-High | Yes | Yes |
| Text line detection | Medium | Yes | Conditional |
| Color space (LAB) | Low-Medium | Yes | Rarely needed |
| Sharpening (USM) | Low | Yes | Rarely needed |

---

## Sources

- [Improving the quality of the output -- Tesseract documentation](https://tesseract-ocr.github.io/tessdoc/ImproveQuality.html)
- [Boost Tesseract OCR Accuracy: Advanced Tips & Techniques -- SparkCo](https://sparkco.ai/blog/boost-tesseract-ocr-accuracy-advanced-tips-techniques)
- [OCR Accuracy Improvement on Document Images Through a Novel Pre-Processing Approach (Arvind et al., 2015)](https://arxiv.org/abs/1509.03456)
- [Improving the Accuracy of Tesseract 4.0 OCR Engine Using Convolution-Based Preprocessing (Bui et al., 2020)](https://www.mdpi.com/2073-8994/12/5/715)
- [Enhancing OCR Accuracy with Super Resolution (Lat & Jawahar, ICPR 2018)](https://cvit.iiit.ac.in/images/ConferencePapers/2018/ocr_Ankit_Lat_ICPR_2018.pdf)
- [Robust Combined Binarization Method of Non-Uniformly Illuminated Document Images (PMC)](https://pmc.ncbi.nlm.nih.gov/articles/PMC7287981/)
- [A Comprehensive Review on Document Image Binarization (PMC)](https://pmc.ncbi.nlm.nih.gov/articles/PMC12112497/)
- [Efficient binarization technique for severely degraded document images (Springer)](https://link.springer.com/article/10.1007/s40012-014-0045-5)
- [Image Analysis of Sauvola and Niblack Thresholding Techniques (ResearchGate)](https://www.researchgate.net/publication/352453230_Image_Analysis_of_Sauvola_and_Niblack_Thresholding_Techniques)
- [Document cleanup using page frame detection (IJDAR, Springer)](https://link.springer.com/article/10.1007/s10032-008-0071-7)
- [Deskewing scanned documents using horizontal projections (Muthukrishnan)](https://muthu.co/deskewing-scanned-documents-using-horizontal-projections/)
- [Going Grey? Comparing the OCR Accuracy Levels of Bitonal and Greyscale Images (D-Lib)](https://www.dlib.org/dlib/march09/powell/03powell.html)
- [Using JavaScript to Preprocess Images for OCR (DEV Community)](https://dev.to/mathewthe2/using-javascript-to-preprocess-images-for-ocr-1jc)
- [Pixel manipulation with canvas (MDN)](https://developer.mozilla.org/en-US/docs/Web/API/Canvas_API/Tutorial/Pixel_manipulation_with_canvas)
- [CLAHE Histogram Equalization (GeeksforGeeks)](https://www.geeksforgeeks.org/python/clahe-histogram-eqalization-opencv/)
- [Optimizing OCR Accuracy on Older Documents (GovInfo)](https://www.govinfo.gov/media/WhitePaper-OptimizingOCRAccuracy.pdf)
- [PreP-OCR: A Complete Pipeline for Document Image Restoration and Enhanced OCR Accuracy (arXiv, 2025)](https://arxiv.org/html/2505.20429v1)
- [Recommended Scan Settings for the Best OCR Accuracy (Dynamsoft)](https://www.dynamsoft.com/blog/insights/scan-settings-for-best-ocr-accuracy/)
