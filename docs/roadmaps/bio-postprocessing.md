---
description: TDD roadmap for bio parameter extraction pipeline with dictionary, parser, validator, and UI integration.
---

# Roadmap — Bio Post-Processing Pipeline

## Objectif

Implement structured biological parameter extraction from OCR text, as specified in `docs/specs/bio-postprocessing.md`. The pipeline extracts parameter name, value, unit from raw OCR text and flags implausible values.

## Phase 1 — Bio Parameter Dictionary

### Titre
Comprehensive biological parameter dictionary

### Objectif
Create an exhaustive dictionary of French biological parameters with metadata (abbreviations, aliases, units, plausible ranges) and a lookup function supporting exact match, abbreviation match, and fuzzy match.

### TDD Steps

**RED:**
- Test that the dictionary contains all required parameter categories (hematology, biochemistry, hemostasis, tumor markers, endocrinology, inflammation, vitamins)
- Test exact lookup by canonical name (case-insensitive)
- Test lookup by abbreviation ("Hb" → "Hémoglobine", "GR" → "Hématies")
- Test fuzzy lookup tolerating OCR errors ("Glycérnie" → "Glycémie")
- Test that each entry has required metadata: name, abbreviations, aliases, units, plausibleRange
- Test getPlausibleRange(name, unit) returns correct min/max

**GREEN:**
- Create `src/lib/bio/parameters.ts` — the dictionary data structure (array of BioParameter objects)
- Create `src/lib/bio/lookup.ts` — lookup functions (exact, abbreviation, fuzzy)
- Create `src/types/bio.ts` — TypeScript types (BioParameter, BioResult, PlausibleRange)

**REFACTOR:**
- Optimize lookup with pre-built index maps for O(1) exact/abbreviation matching

### Parallélisation
Dictionary data and lookup logic can be implemented by a single agent since they're tightly coupled.

### Review gate
Run `/adversarial-review` after this phase — the dictionary is foundational.

### Critères de complétion
- [ ] All dictionary coverage tests pass
- [ ] Lookup by name, abbreviation, and fuzzy match works
- [ ] Each parameter has units and plausible ranges
- [ ] `npx vitest run` passes

### Dépendances
None (first phase)

---

## Phase 2 — Text Cleaner & Line Parser

### Titre
OCR text cleaning and structured line extraction

### Objectif
Clean raw OCR text (strip whitespace, remove artifacts, remove empty lines) and parse individual lines to extract parameter name, numeric value, and unit.

### TDD Steps

**RED:**
- Test text cleaner: strips whitespace, removes empty lines, removes artifacts (|, ~, ---)
- Test line parser: "Glycémie 0.95 g/L" → { name: "Glycémie", value: 0.95, unit: "g/L" }
- Test line parser with colon separator: "Glycémie : 0.95 g/L"
- Test line parser with dot-leaders: "Glycémie ......... 0.95 g/L"
- Test line parser with comma decimal: "Glycémie 0,95 g/L" → value 0.95
- Test line parser with abbreviation: "Hb 13.5 g/dL" → name "Hémoglobine"
- Test line parser returns null for non-result lines
- Test line parser handles percentage: "Hématocrite 42.5 %" → unit "%"

**GREEN:**
- Create `src/lib/bio/cleaner.ts` — text cleaning functions
- Create `src/lib/bio/line-parser.ts` — line parsing with regex + dictionary lookup

**REFACTOR:**
- Extract regex patterns into named constants for readability

### Parallélisation
Cleaner and line parser can be developed by 2 parallel agents if time permits, but they're small enough for one agent.

### Critères de complétion
- [ ] All cleaner tests pass
- [ ] All line parser tests pass
- [ ] Parser handles all separator variants (space, colon, dots)
- [ ] Parser resolves abbreviations via dictionary lookup

### Dépendances
Phase 1 (dictionary lookup needed for abbreviation resolution in parser)

---

## Phase 3 — Value Validator & Full Pipeline

### Titre
Plausibility validation and end-to-end pipeline

### Objectif
Validate extracted values against dictionary plausible ranges, and assemble the full pipeline: clean → extract lines → parse → validate → produce BioResult[].

### TDD Steps

**RED:**
- Test validator: value within range → flagged=false
- Test validator: value outside range → flagged=true
- Test validator: negative value → flagged=true
- Test validator: unknown unit → flagged=false (no range to check)
- Test full pipeline: multi-line input → array of BioResult
- Test full pipeline: mixed valid/invalid lines → only bio lines extracted
- Test full pipeline: implausible values flagged correctly

**GREEN:**
- Create `src/lib/bio/validator.ts` — plausibility validation
- Create `src/lib/bio/pipeline.ts` — orchestrates clean → parse → validate
- Export `extractBioResults(rawText: string): BioResult[]`

**REFACTOR:**
- Ensure pipeline is pure function (no side effects), easy to test

### Review gate
Run `/adversarial-review` after this phase — the pipeline is the core deliverable.

### Critères de complétion
- [ ] All validator tests pass
- [ ] Full pipeline tests pass
- [ ] Pipeline produces correct BioResult[] from realistic OCR input
- [ ] `npx vitest run` passes

### Dépendances
Phase 1, Phase 2

---

## Phase 4 — UI Integration

### Titre
Display bio results in ResultsPanel

### Objectif
Integrate the bio extraction pipeline into the existing ResultsPanel component to show structured bio results alongside raw OCR text.

### TDD Steps

**RED:**
- Test that ResultsPanel shows a "Bio" section when OCR text contains extractable bio parameters
- Test that each parameter displays as "Name Value Unit" on one line
- Test that flagged values have a visual warning indicator
- Test that bio results section is copyable

**GREEN:**
- Add `BioResultsSection` sub-component in `src/components/BioResultsSection.tsx`
- Integrate into existing `ResultsPanel.tsx`
- Call `extractBioResults()` on the OCR text and display results

**REFACTOR:**
- Memoize extraction to avoid re-computation on re-renders

### Critères de complétion
- [ ] Bio results display correctly in ResultsPanel
- [ ] Flagged values are visually distinct
- [ ] Copy functionality works
- [ ] `npx biome check --write .` passes
- [ ] `npx vitest run` passes

### Dépendances
Phase 3

---

## Out of scope

- Auto-correction of flagged values
- Multi-language support
- PDF table structure detection
- Reference range extraction
- Historical trend analysis
