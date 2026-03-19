---
description: Research on OCR strategies for extracting structured data from scanned biological and medical lab reports in an offline browser-based tool.
---

# OCR Strategies for Scanned Medical/Biological Lab Reports

## Context

BioOCR is an offline browser-based tool for extracting text from scanned biological lab results (blood tests, urine analysis, etc.). This report surveys the current state of the art and practical strategies across eight areas critical to the project.

---

## 1. Layout Analysis for Lab Reports

Lab reports follow semi-structured layouts: a header zone (patient info, lab logo, date), a body with table-like rows (test name | result | unit | reference range), and sometimes a footer with signatures or stamps.

### Table Detection Approaches

- **DETR-based models** (DEtection TRansformer): A 2024 study fine-tuned DETR R18 for table detection in scanned lab reports, achieving AP50 of 0.774. For table *recognition* (understanding the cell structure), fine-tuned EDD reached a TEDS score of 0.815.
- **Line-formation heuristic**: The PP-OCR pipeline used by Peking University First Hospital skips explicit table detection entirely. Instead, it detects individual text boxes, then groups them into lines based on vertical coordinate proximity. Multi-column layouts are detected by identifying repeated "LabName" entities and using their x-position as a column split point. This lightweight approach processed reports in 0.78s on a single CPU.

### Practical Recommendation for BioOCR

Full deep-learning table detection (DETR, TableNet) is too heavy for browser WASM. The **line-formation heuristic** is more viable:

1. Run OCR to get bounding boxes for every word/phrase.
2. Sort boxes by y-coordinate, group into lines using a vertical proximity threshold.
3. Within each line, sort by x-coordinate.
4. Detect columns by analyzing the x-distribution of bounding boxes across all lines (cluster the left-edges).

This approach works well because lab report tables are simple: typically 3-5 columns, no merged cells, consistent row heights.

### Tesseract PSM Modes for Structured Content

When using Tesseract-based engines, the Page Segmentation Mode matters:

| PSM | Description | Use Case |
|-----|-------------|----------|
| 4   | Assume a single column of variable-size text | Columnar data, receipts |
| 6   | Assume a single uniform block of text | Individual zones/cells |
| 11  | Sparse text, find as much text as possible | Table-like layouts |
| 12  | Sparse text with OSD | Columnar/sparse formats |

For lab reports, **PSM 6 on individual zones** or **PSM 4 on column regions** is likely optimal. Use `-c preserve_interword_spaces=1` to maintain column alignment in the raw output.

---

## 2. Number Extraction

Lab results are dominated by numeric values with units: `4.5 g/L`, `120 mmol/L`, `< 0.5 UI/mL`, `3.8 - 5.2`. Accurate number extraction is the single most important accuracy requirement.

### Common Numeric OCR Errors

| True Value | OCR Output | Error Type |
|-----------|-----------|------------|
| `1` | `l`, `I`, `7` | Character confusion (1/l/I) |
| `0` | `O`, `o` | Zero/letter-O confusion |
| `5` | `S`, `s` | Five/S confusion |
| `.` (decimal) | `,` (comma) or missing | Decimal point loss |
| `4.5` | `45` | Decimal point missed entirely |
| `< 0.5` | `<0.5`, `c 0.5` | Operator merging or misread |
| `3.8 - 5.2` | `3.8-5.2`, `38 - 52` | Range separator or decimal loss |

### Strategies for Accurate Numeric OCR

1. **Increase effective DPI for number zones**: If the input is 150 DPI, upscale the number zones 2x before OCR. Numbers at 300+ DPI OCR significantly better.
2. **Use PSM 7 (single text line) or PSM 8 (single word)** when OCRing individual cells. This constrains Tesseract to treat the region as a single value.
3. **Whitelist characters**: When OCRing a cell known to be numeric, restrict the character set to `0123456789.,<>-+/ ` using Tesseract's `tessedit_char_whitelist`. This eliminates letter/digit confusion entirely.
4. **Post-OCR regex extraction**: Parse the raw OCR string with patterns like:
   - Value: `(\d+[.,]?\d*)`
   - Range: `(\d+[.,]?\d*)\s*[-–]\s*(\d+[.,]?\d*)`
   - Value with unit: `(\d+[.,]?\d*)\s*(g/[dlL]|mmol/L|UI/mL|%|...)`
5. **Decimal separator normalization**: French lab reports use commas as decimal separators (`4,5 g/L`). Always normalize to a canonical form before validation.

---

## 3. Prior-Based Correction

Domain knowledge about lab tests is a powerful error-correction tool. Lab reports contain a finite, well-known vocabulary.

### Test Name Dictionary

Build a dictionary of known lab test names (in French and English):

```
Hemoglobine, Hematocrite, Leucocytes, Plaquettes, VGM, TCMH, CCMH,
Glycemie, Creatinine, Uree, Cholesterol, Triglycerides, ASAT, ALAT,
Gamma GT, Bilirubine, TSH, T3, T4, PSA, HbA1c, CRP, VS, ...
```

Use **fuzzy matching** (Levenshtein distance) to map OCR output to the nearest known test name. For example, `Hematocrlte` (OCR error: `i` read as `l`) maps to `Hematocrite` with distance 1.

### Value Range Validation

Each test has a biologically plausible range. Values outside this range are likely OCR errors:

| Test | Plausible Range | Unit |
|------|----------------|------|
| Hemoglobine | 5 - 25 | g/dL |
| Glycemie | 0.3 - 5.0 | g/L |
| Creatinine | 2 - 200 | mg/L |
| Plaquettes | 10 - 1000 | 10^3/mm^3 |

If the OCR reads `Glycemie: 45 g/L`, this is biologically implausible. A likely correction is `4.5 g/L` (missed decimal point) or `0.45 g/L`.

### Unit Validation

Each test has a small set of valid units. If the OCR reads `g/I` for hemoglobin, the system can correct it to `g/L` (I/L confusion) because `g/L` is the only plausible unit.

### Correction Pipeline

```
OCR output -> Fuzzy match test name -> Validate unit -> Validate value range
                                                            |
                                              Flag if implausible
                                              Suggest correction if unambiguous
```

### Confidence Scoring

Assign a confidence score to each extracted value based on:
- OCR engine confidence (Tesseract provides per-word confidence)
- Fuzzy match distance for the test name
- Whether the value falls within the expected range
- Whether the unit matches expected units

Flag low-confidence extractions for user review. A threshold of 85-90% is typical in healthcare OCR.

---

## 4. Handling Mixed Content

Lab reports contain printed text, handwritten annotations, stamps (e.g., "CONFORME", lab validation stamps), logos, and barcodes.

### Segmentation Strategy

1. **Zone classification first**: Before OCR, classify regions of the page:
   - **Printed text zones** (high contrast, uniform font)
   - **Handwritten zones** (variable stroke width, less uniform)
   - **Graphical elements** (logos, stamps, barcodes) -- skip these
2. **Simple heuristic**: Stamps and logos tend to be in fixed positions (top header, bottom footer, margins). The data table occupies the center of the page. A coarse zone mask focusing on the central 60-80% of the page width and 30-80% of the page height will capture most data while excluding headers/logos/stamps.

### Handling Stamps Overlapping Data

Stamps (especially validation stamps in red/blue ink) can overlay printed text. Strategies:
- **Color-based filtering**: Many stamps are in colored ink. Convert to specific color channels and threshold to separate stamp pixels from black printed text.
- **Morphological filtering**: Stamps often have large connected components (circular shapes). Remove connected components above a size threshold before OCR.

### Handwritten Annotations

Handwritten text (doctor's notes, corrections) is generally unreliable with Tesseract-class OCR. Recommended approach:
- Detect handwritten regions (different stroke characteristics).
- **Do not attempt OCR** on them in the automated pipeline.
- Flag them visually for the user: "Handwritten annotation detected in this zone -- please review manually."

---

## 5. Zone Selection Strategies

### Full-Page vs. Zonal OCR

| Approach | Accuracy | Speed | Flexibility |
|----------|----------|-------|-------------|
| Full-page OCR | 70-85% for structured extraction | Slower | Works on any layout |
| Zonal OCR (predefined zones) | 90-99% for known layouts | Faster | Breaks on layout changes |
| **Hybrid: full-page detect + zone OCR** | Best of both | Medium | Recommended |

### Recommended Hybrid Approach for BioOCR

1. **Full-page OCR pass** at low resolution or with fast settings to detect the overall layout (find the data table boundaries).
2. **Zone-level OCR** on the detected data region at higher quality settings.
3. **Cell-level OCR** on individual cells if higher accuracy is needed for specific values.

### Zone Size Considerations

- **Too small** (< 50px height): Tesseract struggles with very small text regions. Upscale to at least 50px character height.
- **Optimal**: Individual rows or cells of the lab table, padded by 5-10px on each side.
- **Too large** (full page): Tesseract's layout analysis may incorrectly merge columns or split rows.

### User-Assisted Zone Selection

Given BioOCR is interactive, consider letting the user:
1. Draw a rectangle around the data table (one-time action per document type).
2. The system OCRs only that zone with optimized settings.
3. Save the zone template for reuse on similar documents from the same lab.

This semi-automated approach combines the accuracy of zonal OCR with the flexibility to handle different lab report formats.

---

## 6. Browser-Based OCR Engine Options

All options must run **offline in the browser** (no server calls).

### Tesseract.js

- **What**: JavaScript/WASM port of Tesseract 5.x via Emscripten.
- **Size**: ~4-5 MB (WASM + English language data).
- **Accuracy**: Good for printed text, mediocre for degraded scans.
- **Features**: 100+ languages, bounding boxes at word/line/paragraph level, confidence scores.
- **PSM control**: Supports all Tesseract page segmentation modes.
- **Character whitelisting**: Supported via `tessedit_char_whitelist`.
- **License**: Apache 2.0.
- **GitHub**: [naptha/tesseract.js](https://github.com/naptha/tesseract.js)

### tesseract-wasm

- **What**: Leaner WASM build of Tesseract, stripped of non-browser functionality.
- **Size**: ~2.1 MB with Brotli compression (smaller than tesseract.js).
- **Performance**: Uses SIMD when available (Chrome 91+, Firefox 90+, Safari 16.4+).
- **API**: High-level async `OCRClient` (runs in Web Worker) + low-level sync `OCREngine`.
- **Limitation**: Fewer features than tesseract.js, less community support.
- **License**: Apache 2.0.
- **GitHub**: [robertknight/tesseract-wasm](https://github.com/robertknight/tesseract-wasm)

### Scribe.js

- **What**: Built on top of Tesseract.js with improved recognition models.
- **Accuracy**: Fewer misidentified words than Tesseract.js on high-quality scans. Recognizes words that Tesseract.js skips entirely.
- **Features**: PDF text extraction, font style identification, built-in web GUI.
- **Performance**: "Quality" mode is 40-90% slower than Tesseract.js; "Speed" mode is comparable.
- **Size**: Larger than Tesseract.js due to PDF dependencies.
- **License**: **AGPL 3.0** (copyleft -- significant licensing consideration).
- **GitHub**: [scribeocr/scribe.js](https://github.com/scribeocr/scribe.js)

### Comparison Summary

| Feature | tesseract.js | tesseract-wasm | Scribe.js |
|---------|-------------|----------------|-----------|
| Download size | ~4-5 MB | ~2.1 MB | Larger |
| Accuracy | Good | Good | Better |
| SIMD support | No | Yes | No |
| PDF support | No | No | Yes |
| Character whitelist | Yes | Limited | Yes |
| Bounding boxes | Yes | Yes | Yes |
| License | Apache 2.0 | Apache 2.0 | AGPL 3.0 |

### Recommendation

**Tesseract.js** is the safest choice: permissive license, large community, full feature set including character whitelisting and PSM control. For a lab report tool, the accuracy delta of Scribe.js may not justify the AGPL constraint. The character whitelisting and zone-based approach described in this report can close much of the accuracy gap.

### Image Preprocessing in the Browser

**OpenCV.js** provides near-native image processing in the browser via WASM:
- Grayscale conversion, binarization (Otsu, adaptive threshold), deskewing, noise removal, morphological operations.
- Can be loaded as a single JS+WASM file.
- Integrates with HTML5 Canvas for display.
- [OpenCV.js documentation](https://docs.opencv.org/4.x/d0/d84/tutorial_js_usage.html)

Alternatively, **lighter-weight Canvas API operations** (grayscale, threshold, contrast) can be done with raw pixel manipulation on `<canvas>` without the ~8 MB OpenCV.js dependency.

---

## 7. Practical Preprocessing Pipeline

A recommended preprocessing pipeline for scanned lab results, implementable in the browser:

### Step 1: Load and Normalize

```
Input image (JPEG/PNG from scanner or phone camera)
  -> Decode into Canvas/ImageData
  -> Scale to ensure minimum 300 DPI equivalent
     (if image width < 2400px for A4, upscale 2x with bilinear interpolation)
```

### Step 2: Grayscale Conversion

```
RGB -> Grayscale (luminance: 0.299*R + 0.587*G + 0.114*B)
```

### Step 3: Deskew

```
Detect dominant text line angle (Hough transform or projection profile)
  -> If angle > 0.5 degrees, rotate to correct
```

Deskewing is critical: even 1-2 degrees of skew degrades Tesseract's line segmentation significantly.

### Step 4: Noise Reduction

```
Apply Gaussian blur (kernel 3x3) to reduce scanner noise
  -> Or median filter (3x3) which better preserves edges
```

Only apply if the image is visibly noisy. Over-smoothing degrades thin strokes.

### Step 5: Binarization

```
Adaptive threshold (Gaussian, block size 31-51, constant 10-15)
  -> Produces clean black text on white background
```

**Adaptive thresholding** (not global Otsu) is preferred for lab reports because:
- Scan quality may vary across the page.
- Stamps/watermarks create local background variation.
- Adaptive threshold handles all of this.

### Step 6: Stamp/Noise Removal (Optional)

```
Connected component analysis
  -> Remove components with area > threshold (stamps, logos)
  -> Remove components with area < threshold (pepper noise)
```

### Step 7: Zone Extraction

```
Detect data table region (see section 5)
  -> Crop to table region with 10px padding
  -> Optionally split into individual rows/cells
```

### Step 8: OCR

```
For each zone:
  -> Select appropriate PSM mode
  -> Apply character whitelist if zone type is known (numeric, text)
  -> Run Tesseract
  -> Collect bounding boxes + confidence scores + text
```

### Pipeline Summary

```
Image -> Grayscale -> Deskew -> Denoise -> Binarize -> Remove stamps
  -> Detect table zone -> Split rows -> OCR per row/cell -> Post-process
```

Each step can improve OCR accuracy by 5-15%. Combined, preprocessing can lift accuracy from ~80% to ~95% on typical scanned lab reports. Studies report up to 15% accuracy improvement from noise removal alone.

---

## 8. Common OCR Errors on Lab Documents

### Error Taxonomy

#### A. Character-Level Errors

| Error Category | Examples | Frequency |
|---------------|----------|-----------|
| Digit/letter confusion | `0`/`O`, `1`/`l`/`I`, `5`/`S` | Very high |
| Similar digit confusion | `3`/`8`, `6`/`0`, `7`/`1` | High |
| Decimal point loss | `4.5` -> `45`, `0.8` -> `08` | High |
| Comma/period confusion | `4,5` -> `4.5` or `45` | Medium (French docs) |
| Slash confusion | `g/L` -> `g/l`, `g/I`, `g/1` | Medium |

#### B. Structural Errors

| Error Category | Description |
|---------------|-------------|
| Column merging | Adjacent columns read as one line |
| Row splitting | One row broken into multiple lines |
| Cell misalignment | Value assigned to wrong test name |
| Header/data confusion | Column headers read as data rows |

#### C. Content-Specific Errors

| Error Category | Examples |
|---------------|----------|
| Unit corruption | `mmol/L` -> `mmol/l`, `mmoI/L`, `mmol/i` |
| Range operator | `3.8 - 5.2` -> `3.8-5.2`, `38 - 52` |
| Superscript loss | `10^3/mm^3` -> `103/mm3` |
| Less-than operator | `< 0.5` -> `c 0.5`, `<0.5` |
| Greek letters | `gamma` -> `y`, `alpha` -> `a` |

#### D. Quality-Dependent Errors

| Scan Quality | Typical Accuracy | Main Issues |
|-------------|-----------------|-------------|
| 300 DPI, clean | 95-98% | Minimal |
| 200 DPI, clean | 90-95% | Small text degradation |
| 150 DPI | 80-90% | Widespread digit errors |
| 150 DPI + stamps | 70-85% | Stamp overlay, noise |
| Fax quality | 60-75% | Severe degradation |

### Most Dangerous Errors for Lab Data

These errors change the clinical meaning of results:

1. **Decimal point loss**: `4.5 g/L` -> `45 g/L` (10x error)
2. **Digit transposition**: `135 mmol/L` -> `153 mmol/L`
3. **Cell misalignment**: Hemoglobin value placed on the Hematocrit row
4. **Missing minus sign**: `< 0.5` read as `0.5` (changes interpretation from "below threshold" to "exactly at threshold")

### Mitigation Strategy Summary

| Error Type | Mitigation |
|-----------|-----------|
| Digit/letter confusion | Character whitelisting for numeric fields |
| Decimal loss | Range validation (section 3), regex post-processing |
| Column merging | Zone-based OCR on individual cells |
| Unit corruption | Unit dictionary + fuzzy matching |
| Structural errors | Bounding-box-based layout reconstruction |
| All errors | Confidence scoring + user review for low confidence |

---

## Summary of Recommendations for BioOCR

| Area | Recommendation |
|------|---------------|
| OCR Engine | Tesseract.js (Apache 2.0, full feature set) |
| Preprocessing | Canvas API for basics; OpenCV.js only if deskew/morphology needed |
| Layout Analysis | Bounding-box clustering (no deep learning required) |
| Number Accuracy | Character whitelisting + PSM 7/8 on individual cells |
| Validation | Test name dictionary + value range checking + unit validation |
| Zone Strategy | Hybrid: user-assisted table zone + automatic row splitting |
| Mixed Content | Color filtering for stamps; skip handwritten zones |
| Error Handling | Confidence scores + flag implausible values for user review |

---

## Sources

- [Extracting laboratory test information from paper-based reports (PMC, 2023)](https://pmc.ncbi.nlm.nih.gov/articles/PMC10629084/)
- [Improving tabular data extraction in scanned laboratory reports using deep learning models (ScienceDirect, 2024)](https://www.sciencedirect.com/science/article/pii/S1532046424001539)
- [Enhancing Medical Diagnosis Document Analysis with Layout-Aware Multitask Models (PMC, 2024)](https://pmc.ncbi.nlm.nih.gov/articles/PMC12691868/)
- [OCR for Medical Laboratory Reports (GitHub)](https://github.com/xuewenyuan/OCR-for-Medical-Laboratory-Reports)
- [Tesseract.js (GitHub)](https://github.com/naptha/tesseract.js)
- [tesseract-wasm (GitHub)](https://github.com/robertknight/tesseract-wasm)
- [Scribe.js vs Tesseract.js comparison](https://github.com/scribeocr/scribe.js/blob/master/docs/scribe_vs_tesseract.md)
- [Tesseract Page Segmentation Modes Explained (PyImageSearch)](https://pyimagesearch.com/2021/11/15/tesseract-page-segmentation-modes-psms-explained-how-to-improve-your-ocr-accuracy/)
- [Improving Tesseract Output Quality (tessdoc)](https://tesseract-ocr.github.io/tessdoc/ImproveQuality.html)
- [What is Zonal OCR (KlearStack)](https://klearstack.com/zonal-ocr)
- [8 Common OCR Errors and How to Fix Them (Gennai)](https://www.gennai.io/blog/common-ocr-errors-fix-them)
- [OCR Transposition Errors (FasterCapital)](https://fastercapital.com/content/OCR-Transposition-Errors--The-Pitfalls-of-Optical-Character-Recognition.html)
- [OpenCV.js Documentation](https://docs.opencv.org/4.x/d0/d84/tutorial_js_usage.html)
- [Deep learning-based NLP data pipeline for EHR-scanned document information extraction (JAMIA Open, 2022)](https://academic.oup.com/jamiaopen/article/5/2/ooac045/6605916)
- [7 Best Open-Source OCR Models 2025 (E2E Networks)](https://www.e2enetworks.com/blog/complete-guide-open-source-ocr-models-2025)
