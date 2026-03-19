---
description: Comprehensive guide to optimizing Tesseract.js OCR accuracy for medical/lab documents through configuration, preprocessing, post-processing, and prior knowledge exploitation.
---

# Tesseract.js Configuration and Post-Processing for Better OCR Results

## 1. Tesseract Configuration Variables

### Page Segmentation Modes (PSM)

PSM controls how Tesseract segments the image before recognition. The default (PSM 3) assumes a full page of text, which is wrong for cropped regions or structured documents.

| PSM | Description | Use case |
|-----|-------------|----------|
| 0 | Orientation and script detection only | Pre-analysis step |
| 1 | Auto segmentation + OSD | Full pages with unknown orientation |
| 3 | Fully automatic (default) | Full pages, known orientation |
| 4 | Single column, variable sizes | Single-column documents |
| 6 | Single uniform block of text | One block of uniform text |
| 7 | Single text line | Isolated line (e.g., a single lab result row) |
| 8 | Single word | Isolated word extraction |
| 10 | Single character | Individual character recognition |
| 11 | Sparse text, no particular order | Scattered text on a page |
| 13 | Raw line (bypasses Tesseract hacks) | When PSM 7 over-corrects |

**Recommendation for lab documents:** Use PSM 6 for full result blocks, PSM 7 for individual lines, or PSM 4 for single-column lab reports. Avoid PSM 3 on cropped regions -- it wastes time on page-level segmentation that does not apply.

### OCR Engine Modes (OEM)

| OEM | Description | Notes |
|-----|-------------|-------|
| 0 | Legacy engine only | Requires `tessdata` (standard) models. Not available in `tessdata_best` or `tessdata_fast`. |
| 1 | LSTM neural net only | Best accuracy. Default with `tessdata_best`. |
| 2 | Legacy + LSTM combined | Slower, may not improve results over LSTM alone. |
| 3 | Default (uses what is available) | Safe default. |

**Recommendation:** OEM 1 (LSTM only) with `tessdata_best` models gives the highest accuracy.

### Character Whitelist / Blacklist

```js
await worker.setParameters({
  tessedit_char_whitelist: '0123456789.,/<>=-+ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz %():',
  // OR to blacklist specific characters:
  // tessedit_char_blacklist: '|{}[]~`',
});
```

Whitelisting restricts Tesseract to emitting only the listed characters. This is powerful when you know the character set in advance (e.g., lab results contain digits, units, and limited punctuation).

**Caveat:** With LSTM engine (OEM 1), whitelist support is less reliable than with the legacy engine. It works as a post-filter rather than influencing the neural net decoder. Still useful, but less effective than with OEM 0.

### Setting Parameters in Tesseract.js

```js
// Parameters set at worker creation ("init only" params)
const worker = await Tesseract.createWorker('fra', Tesseract.OEM.LSTM_ONLY, {
  config: {
    load_system_dawg: '0',     // Disable system dictionary
    load_freq_dawg: '0',       // Disable frequency dictionary
    load_number_dawg: '1',     // Keep number patterns
    user_words_file: '/app/custom.words',
    user_patterns_file: '/app/custom.patterns',
  },
});

// Parameters set after initialization
await worker.setParameters({
  tessedit_pageseg_mode: Tesseract.PSM.SINGLE_BLOCK,
  tessedit_char_whitelist: '0123456789.,- ABCDabcdefg/LlmMgGUuIi%<>=()',
  preserve_interword_spaces: '1',
  user_defined_dpi: '300',
});
```

## 2. Tessdata Models

Three repositories exist with different accuracy/speed tradeoffs:

| Repository | Model type | Speed | Accuracy | Retrainable | OEM support |
|------------|-----------|-------|----------|-------------|-------------|
| `tessdata_best` | Float LSTM | Slowest | Highest | Yes (fine-tuning possible) | OEM 1 only |
| `tessdata_fast` | Integer LSTM (smaller net) | Fastest | ~5% worse than best | No | OEM 1 only |
| `tessdata` (standard) | Integer LSTM + legacy | Medium | Medium | No | OEM 0 and 1 |

**Recommendation for medical/lab documents:** Use `tessdata_best`. The speed penalty is acceptable for document-level OCR (not real-time video). The accuracy gain matters when distinguishing between `1` and `l`, `0` and `O`, or reading small decimal values like `0.85` vs `0.65`.

### How to Use tessdata_best with Tesseract.js

Tesseract.js downloads language data from the `tessdata_fast` repository by default. To use `tessdata_best`:

```js
const worker = await Tesseract.createWorker('fra', Tesseract.OEM.LSTM_ONLY, {
  langPath: 'https://raw.githubusercontent.com/tesseract-ocr/tessdata_best/main',
  // Or host the .traineddata files yourself for reliability
});
```

## 3. Language Model Impact

### fra vs fra_old

- **`fra`**: Modern French, the standard choice for contemporary documents (lab reports, prescriptions).
- **`fra_old`**: Old French / historical documents (pre-20th century texts). Not useful for lab documents.

### Multi-language: fra+eng

Medical/lab documents in France often contain English abbreviations (HDL, LDL, PSA, TSH, HbA1c) alongside French text. Loading both languages helps:

```js
const worker = await Tesseract.createWorker('fra+eng', Tesseract.OEM.LSTM_ONLY, {
  langPath: 'https://raw.githubusercontent.com/tesseract-ocr/tessdata_best/main',
});
```

**Impact:** Combining languages can improve recognition by up to 20% for mixed-language content. The cost is slightly increased processing time and memory.

**Order matters:** The first language listed is the "primary" language. Use `fra+eng` for French-primary documents with English terms.

### Custom traineddata

For highly specialized domains (medical lab results), you can fine-tune a model:

1. Start from `tessdata_best/fra.traineddata` (only `tessdata_best` supports fine-tuning).
2. Generate training data from representative lab result images.
3. Fine-tune the LSTM model on your domain-specific corpus.
4. Deploy the custom `.traineddata` file.

This is a significant effort and only justified if standard models consistently fail on your documents.

## 4. DPI Requirements

### What Tesseract Expects

Tesseract is optimized for **300 DPI** input. The critical metric is actually **capital letter height in pixels**: Tesseract needs characters to be approximately **20-30 pixels tall** for reliable recognition.

| DPI | Effect |
|-----|--------|
| < 150 | Poor results, characters too small |
| 150-200 | Marginal, may work for large fonts |
| **300** | **Optimal sweet spot** |
| 300-600 | Marginal improvement, slower processing |
| > 600 | No accuracy gain, wastes memory and CPU |

### Setting DPI in Tesseract.js

If the image has no DPI metadata (common with screenshots, photos, canvas exports):

```js
await worker.setParameters({
  user_defined_dpi: '300',
});
```

### Does Upscaling Help?

**Yes, with caveats.** Upscaling a 150 DPI scan to 300 DPI using bicubic interpolation can improve results because Tesseract's internal preprocessing (binarization, line detection) works better with more pixels. However, upscaling does not add information -- it only helps Tesseract's algorithms work within their expected parameter range.

**Best practice:**
- If input is < 200 DPI equivalent: upscale to 300 DPI (2x) using bicubic or Lanczos interpolation.
- If input is 200-300 DPI: leave as-is or upscale to 300 DPI.
- If input is > 300 DPI: do not downscale (it would destroy information).

For browser-based upscaling, use an offscreen canvas with `imageSmoothingQuality: 'high'`.

## 5. Post-Processing

### Spell Checking

General-purpose spell checkers (TextBlob, PyEnchant, Aspell) are **not recommended** for lab results because:
- Lab values are numbers, not words.
- Medical abbreviations (HbA1c, TSH, ASAT) are not in standard dictionaries.
- Spell-correcting "ASAT" to "ASAT" is a no-op, but correcting "ASAT" to "ASST" is destructive.

**If used**, build a domain-specific dictionary of medical terms and lab abbreviations rather than relying on a general French dictionary.

### Dictionary-Based Correction

More useful than spell checking for lab documents:

```js
const LAB_TERMS = new Set([
  'glucose', 'cholesterol', 'triglycerides', 'creatinine',
  'hemoglobine', 'hematocrite', 'leucocytes', 'plaquettes',
  'ASAT', 'ALAT', 'GGT', 'PAL', 'LDH', 'CPK',
  'TSH', 'T3', 'T4', 'PSA', 'HbA1c', 'HDL', 'LDL',
  'mmol/L', 'g/L', 'mg/L', 'UI/L', 'mUI/L', 'µmol/L',
  'g/dL', 'mg/dL', 'fl', 'pg', '%', 'mm/h',
]);

function correctTerm(ocrText) {
  // Find closest match in dictionary using Levenshtein distance
  // Only correct if distance <= 2 and confidence is low
}
```

### Regex-Based Cleanup

Lab results follow predictable patterns. Regex can validate and clean OCR output:

```js
// Numeric value with unit: "4.52 g/L", "125 mg/dL"
const VALUE_UNIT = /(\d+[.,]\d+)\s*(g\/[Ld]L|mg\/[Ld]L|mmol\/L|UI\/L|mUI\/L|µmol\/L|fl|pg|%|mm\/h)/i;

// Reference range: "4.0 - 6.0" or "(4.0-6.0)" or "< 5.0"
const RANGE = /[(<]?\s*\d+[.,]?\d*\s*[-–]\s*\d+[.,]?\d*\s*[)>]?/;

// Common OCR errors in numbers
function fixNumericOcr(text) {
  return text
    .replace(/[Oo]/g, '0')    // O -> 0 in numeric context
    .replace(/[Ll|]/g, '1')   // l, |, L -> 1 in numeric context
    .replace(/[Ss]/g, '5')    // S -> 5 in numeric context
    .replace(/[Bb]/g, '8')    // B -> 8 in numeric context
    // Only apply these in confirmed numeric regions!
}
```

**Warning:** Character substitution (O->0, l->1) must only be applied in contexts confirmed to be numeric. Applying it globally would destroy text content.

## 6. Prior Knowledge Exploitation

This is the highest-value optimization for lab document OCR. When you know the document structure, you can constrain the recognition space dramatically.

### Strategy 1: Character Whitelists per Region

If you can segment the document into regions (header, test names, values, units, ranges), apply different whitelists to each region:

```js
// For numeric value columns
await worker.setParameters({
  tessedit_char_whitelist: '0123456789.,<>= -',
});
const valueResult = await worker.recognize(image, { rectangle: valueRegion });

// For unit columns
await worker.setParameters({
  tessedit_char_whitelist: 'gGmMlLuUdDIi/µ%fhpPaAnNoeE ',
});
const unitResult = await worker.recognize(image, { rectangle: unitRegion });

// For test name columns
await worker.setParameters({
  tessedit_char_whitelist: '', // Empty = all characters allowed
});
const nameResult = await worker.recognize(image, { rectangle: nameRegion });
```

### Strategy 2: Custom Word Lists and Patterns

Write custom word lists and pattern files to Tesseract's MEMFS:

```js
// Write a custom words file
await worker.writeText('/app/lab.words', [
  'Glucose', 'Cholesterol', 'Triglycerides', 'Creatinine',
  'Hemoglobine', 'Hematocrite', 'Leucocytes', 'Plaquettes',
  'ASAT', 'ALAT', 'GGT', 'TSH', 'PSA', 'HbA1c',
  'mmol/L', 'g/L', 'mg/L', 'UI/L',
  '',  // Blank line at end required
].join('\n'));

// Write custom patterns file
// \d = digit, \A = alpha, \p = punctuation
await worker.writeText('/app/lab.patterns', [
  '\\d\\d\\d',           // 3-digit number
  '\\d\\d.\\d\\d',       // decimal number like 12.34
  '\\d.\\d\\d',          // decimal number like 1.23
  '\\d\\d\\d.\\d',       // decimal number like 123.4
  '\\A\\A\\A\\A/\\A',    // unit like mmol/L
  '\\A/\\A\\A',          // unit like g/dL
  '',
].join('\n'));
```

**Note:** In Tesseract.js, `user_words_file` and `user_patterns_file` must be set as init-only parameters (in the `config` object of `createWorker`). There are known reliability issues -- test thoroughly.

### Strategy 3: Regex Validation of Results

After OCR, validate each extracted value against expected patterns:

```js
function validateLabResult(name, value, unit) {
  const rules = {
    'Glucose':      { range: [0.5, 5.0],  unit: /g\/L|mmol\/L/i },
    'Cholesterol':  { range: [0.5, 10.0], unit: /g\/L|mmol\/L/i },
    'Creatinine':   { range: [1, 200],    unit: /µmol\/L|mg\/L/i },
    'TSH':          { range: [0.01, 50],  unit: /mUI\/L|µUI\/mL/i },
  };

  const rule = rules[name];
  if (!rule) return { valid: true, confidence: 'unknown_test' };

  const numValue = parseFloat(value.replace(',', '.'));
  const unitMatch = rule.unit.test(unit);
  const rangeMatch = numValue >= rule.range[0] * 0.1 && numValue <= rule.range[1] * 10;
  // Use wide range (10x) to catch abnormal results, but flag impossible values

  return {
    valid: unitMatch && rangeMatch,
    numValue,
    unitMatch,
    rangeMatch,
  };
}
```

### Strategy 4: Confidence-Based Filtering

Tesseract returns confidence scores at word and symbol level:

```js
const result = await worker.recognize(image, {}, { blocks: true });

for (const block of result.data.blocks) {
  for (const paragraph of block.paragraphs) {
    for (const line of paragraph.lines) {
      for (const word of line.words) {
        if (word.confidence < 70) {
          console.warn(`Low confidence (${word.confidence}): "${word.text}"`);
          // Flag for manual review or re-process with different settings
        }
      }
    }
  }
}
```

**Confidence thresholds (practical guidelines):**
- **> 90**: Accept automatically.
- **70-90**: Accept but flag for optional review.
- **< 70**: Re-process with different settings or flag for manual review.

## 7. Multi-Pass OCR

Running OCR multiple times with different configurations and comparing or merging results can improve accuracy.

### Approach 1: Voting System

```js
async function multiPassOcr(worker, image) {
  // Pass 1: Standard settings
  await worker.setParameters({ tessedit_pageseg_mode: '6' });
  const pass1 = await worker.recognize(image, {}, { blocks: true });

  // Pass 2: Single line mode (if document is structured as lines)
  // Run on each detected line from pass 1
  const pass2Results = [];
  for (const line of pass1.data.lines) {
    await worker.setParameters({ tessedit_pageseg_mode: '7' });
    const lineResult = await worker.recognize(image, {
      rectangle: line.bbox,
    }, { blocks: true });
    pass2Results.push(lineResult);
  }

  // Pass 3: Digits-only for numeric regions
  await worker.setParameters({
    tessedit_pageseg_mode: '7',
    tessedit_char_whitelist: '0123456789.,- <>',
  });
  // Run on value columns only

  // Compare passes, take highest-confidence result per word
}
```

### Approach 2: Different Preprocessing per Pass

1. **Pass 1**: Original image, standard settings.
2. **Pass 2**: Binarized image (Otsu threshold), same settings.
3. **Pass 3**: Sharpened image, digits-only whitelist for value regions.

Compare word-level confidence across passes. Take the highest-confidence reading for each word.

### Approach 3: Different Models per Pass

1. **Pass 1**: `tessdata_best/fra` for text regions.
2. **Pass 2**: `tessdata_best/eng` for English abbreviations.
3. Merge results based on confidence scores and expected content type per region.

This requires multiple workers (one per language/model):

```js
const workerFra = await Tesseract.createWorker('fra', Tesseract.OEM.LSTM_ONLY, opts);
const workerEng = await Tesseract.createWorker('eng', Tesseract.OEM.LSTM_ONLY, opts);

// Use scheduler to run in parallel
const scheduler = Tesseract.createScheduler();
scheduler.addWorker(workerFra);
scheduler.addWorker(workerEng);
```

## 8. Tesseract.js v7 Specific Features

### Performance

- **15-35% faster** than v6, thanks to a new `relaxedsimd` WASM build.
- Memory leak fix: a long-standing issue where memory rose over time has been resolved. Critical for multi-pass and batch processing.

### API Changes

- `worker.initialize()` and `worker.loadLanguage()` removed (were deprecated since v5).
- `worker.reinitialize(langs, oem)` available for switching languages/OEM without creating a new worker.
- Node.js v16+ required; uses native `fetch` on Node.js v18+.

### Legacy Model Access

Orientation and script detection (OSD) requires the legacy model, which is no longer included by default:

```js
const worker = await Tesseract.createWorker('fra', Tesseract.OEM.DEFAULT, {
  legacyCore: true,
  legacyLang: true,
});
```

### Output Formats

```js
const result = await worker.recognize(image, {}, {
  text: true,     // Plain text
  blocks: true,   // Structured JSON with words, lines, paragraphs, bboxes, confidence
  hocr: true,     // hOCR XML format
  tsv: true,      // Tab-separated values (includes confidence per word)
});
```

The `blocks` output provides hierarchical access: blocks > paragraphs > lines > words > symbols, each with `text`, `confidence`, and `bbox` properties.

### Rectangle Recognition

Process specific image regions without re-cropping:

```js
const result = await worker.recognize(image, {
  rectangle: { top: 100, left: 50, width: 400, height: 30 },
});
```

This is essential for multi-pass strategies where different regions need different settings.

## Summary: Recommended Configuration for Lab Documents

```js
// Optimal setup for French medical lab result OCR
const worker = await Tesseract.createWorker('fra+eng', Tesseract.OEM.LSTM_ONLY, {
  langPath: 'https://raw.githubusercontent.com/tesseract-ocr/tessdata_best/main',
  config: {
    load_system_dawg: '0',
    load_freq_dawg: '0',
    load_number_dawg: '1',
  },
});

await worker.setParameters({
  tessedit_pageseg_mode: '6',       // Single uniform block
  preserve_interword_spaces: '1',
  user_defined_dpi: '300',
});

// For numeric-heavy regions, switch whitelist:
// tessedit_char_whitelist: '0123456789.,- <>=/()'
```

### Priority-Ordered Optimization Checklist

1. **Image quality first**: Ensure 300 DPI equivalent, good contrast, no skew.
2. **Use `tessdata_best`**: Biggest accuracy gain for minimal cost.
3. **Correct PSM**: Match segmentation mode to your input (block, line, word).
4. **Use `fra+eng`**: Captures both French text and English medical abbreviations.
5. **Region-specific whitelists**: Digits-only for value columns, full charset for labels.
6. **Confidence filtering**: Flag low-confidence words for review.
7. **Regex validation**: Catch impossible values (negative glucose, 3-digit hemoglobin).
8. **Multi-pass for low-confidence regions**: Re-OCR with different PSM or preprocessing.
9. **Custom word lists**: Add medical terms as user_words (if the MEMFS approach works reliably).
10. **Post-processing**: Domain-specific correction (Levenshtein distance to known terms).

## Sources

- [Improving the quality of the output - Tesseract documentation](https://tesseract-ocr.github.io/tessdoc/ImproveQuality.html)
- [Traineddata Files for Version 4.00+ - Tesseract documentation](https://tesseract-ocr.github.io/tessdoc/Data-Files.html)
- [Tesseract.js API documentation](https://github.com/naptha/tesseract.js/blob/master/docs/api.md)
- [Tesseract.js v7.0.0 release notes](https://github.com/naptha/tesseract.js/releases)
- [API example for user patterns - Tesseract documentation](https://tesseract-ocr.github.io/tessdoc/APIExample-user_patterns.html)
- [Tesseract PSM explained - PyImageSearch](https://pyimagesearch.com/2021/11/15/tesseract-page-segmentation-modes-psms-explained-how-to-improve-your-ocr-accuracy/)
- [Whitelisting and Blacklisting Characters - PyImageSearch](https://pyimagesearch.com/2021/09/06/whitelisting-and-blacklisting-characters-with-tesseract-and-python/)
- [Using spellchecking to improve Tesseract OCR accuracy - PyImageSearch](https://pyimagesearch.com/2021/11/29/using-spellchecking-to-improve-tesseract-ocr-accuracy/)
- [Boost Tesseract OCR Accuracy - SparkCo](https://sparkco.ai/blog/boost-tesseract-ocr-accuracy-advanced-tips-techniques)
- [Tesseract OCR tips: custom dictionary - Medium](https://vprivalov.medium.com/tesseract-ocr-tips-custom-dictionary-to-improve-ocr-d2b9cd17850b)
- [tessdata_best repository](https://github.com/tesseract-ocr/tessdata_best)
- [tessdata_fast repository](https://github.com/tesseract-ocr/tessdata_fast)
- [Tesseract.js custom dictionary issue #158](https://github.com/naptha/tesseract.js/issues/158)
- [Tesseract.js init-only parameters issue #613](https://github.com/naptha/tesseract.js/issues/613)
