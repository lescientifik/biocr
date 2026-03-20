---
description: Specs for structured biological parameter extraction from OCR text with dictionary-based validation and flagging.
---

# Bio Post-Processing — Structured Extraction Pipeline

## Feature: Biological parameter dictionary

```gherkin
Feature: Biological parameter dictionary
  A comprehensive dictionary of French biological parameters with metadata
  for fuzzy matching, unit validation, and plausibility checking.

  Scenario: Dictionary contains all major hematology parameters
    Given the bio parameter dictionary
    Then it contains entries for "Leucocytes", "Hématies", "Hémoglobine", "Hématocrite", "VGM", "TCMH", "CCMH", "Plaquettes", "Réticulocytes"
    And it contains entries for "PNN", "PNE", "PNB", "Lymphocytes", "Monocytes"

  Scenario: Dictionary contains all major biochemistry parameters
    Given the bio parameter dictionary
    Then it contains entries for "Glycémie", "Créatinine", "Urée", "Acide urique"
    And it contains entries for "Sodium", "Potassium", "Chlore", "Calcium", "Phosphore", "Magnésium"
    And it contains entries for "ASAT", "ALAT", "GGT", "PAL", "Bilirubine"
    And it contains entries for "Cholestérol total", "HDL", "LDL", "Triglycérides"

  Scenario: Dictionary contains hemostasis parameters
    Given the bio parameter dictionary
    Then it contains entries for "TP", "TCA", "INR", "Fibrinogène", "D-dimères"

  Scenario: Dictionary contains tumor markers
    Given the bio parameter dictionary
    Then it contains entries for "PSA", "CA 125", "CA 19-9", "CA 15-3", "ACE", "AFP"

  Scenario: Dictionary contains endocrinology and inflammation markers
    Given the bio parameter dictionary
    Then it contains entries for "TSH", "T3", "T4", "Cortisol"
    And it contains entries for "CRP", "VS", "Procalcitonine"

  Scenario: Dictionary contains vitamin and iron parameters
    Given the bio parameter dictionary
    Then it contains entries for "Vitamine B9", "Vitamine B12", "Vitamine D"
    And it contains entries for "Fer sérique", "Ferritine", "Transferrine", "CST"

  Scenario: Each parameter has required metadata fields
    Given the bio parameter dictionary
    When I look up any parameter entry
    Then it has a "name" field with the canonical French name
    And it has an "abbreviations" field listing known short forms
    And it has a "aliases" field listing spelling variants and synonyms
    And it has a "units" field listing one or more accepted units
    And it has a "plausibleRange" field per unit with min and max values

  Scenario: Lookup by abbreviation returns the correct parameter
    Given the bio parameter dictionary
    When I look up "Hb"
    Then the result is the "Hémoglobine" parameter
    When I look up "GR"
    Then the result is the "Hématies" parameter
    When I look up "GB"
    Then the result is the "Leucocytes" parameter

  Scenario: Lookup is case-insensitive
    Given the bio parameter dictionary
    When I look up "crp"
    Then the result is the "CRP" parameter
    When I look up "GLYCEMIE"
    Then the result is the "Glycémie" parameter

  Scenario: Fuzzy lookup tolerates OCR errors
    Given the bio parameter dictionary
    When I fuzzy-match "Glycérnie" (OCR error on m→rn)
    Then the best match is "Glycémie"
    When I fuzzy-match "Hérnatocrite" (OCR error on m→rn)
    Then the best match is "Hématocrite"
```

## Feature: OCR text cleaning

```gherkin
Feature: OCR text cleaning
  Cleaning raw OCR text before structured extraction.

  Scenario: Strip leading and trailing whitespace from each line
    Given raw OCR text "  Glycémie   0.95 g/L  \n  Créatinine  78 µmol/L  "
    When I run the text cleaner
    Then each line has no leading or trailing whitespace

  Scenario: Remove empty lines
    Given raw OCR text "Glycémie 0.95 g/L\n\n\n\nCréatinine 78 µmol/L"
    When I run the text cleaner
    Then there are exactly 2 non-empty lines

  Scenario: Remove common OCR artifacts
    Given raw OCR text containing "|", "~", stray underscores, or repeated dashes "---"
    When I run the text cleaner
    Then those artifacts are removed or normalized

  Scenario: Preserve meaningful content
    Given raw OCR text "Glycémie 0.95 g/L [0.70 - 1.10]"
    When I run the text cleaner
    Then the parameter name, value, unit, and reference range text are preserved
```

## Feature: Structured line extraction

```gherkin
Feature: Structured line extraction
  Extracting parameter name, numeric value, and unit from cleaned OCR lines.

  Scenario: Parse a standard lab result line
    Given a cleaned line "Glycémie 0.95 g/L"
    When I run the line parser
    Then the result has name "Glycémie", value 0.95, unit "g/L"

  Scenario: Parse a line with reference range
    Given a cleaned line "Créatinine 78 µmol/L [60 - 110]"
    When I run the line parser
    Then the result has name "Créatinine", value 78, unit "µmol/L"
    And the reference range text is ignored (not part of the extracted value)

  Scenario: Parse a line with colon separator
    Given a cleaned line "Glycémie : 0.95 g/L"
    When I run the line parser
    Then the result has name "Glycémie", value 0.95, unit "g/L"

  Scenario: Parse a line with dot-leaders or spaces as separator
    Given a cleaned line "Glycémie ......... 0.95 g/L"
    When I run the line parser
    Then the result has name "Glycémie", value 0.95, unit "g/L"

  Scenario: Parse a line with comma as decimal separator
    Given a cleaned line "Glycémie 0,95 g/L"
    When I run the line parser
    Then the result has name "Glycémie", value 0.95, unit "g/L"

  Scenario: Parse a line with abbreviation as parameter name
    Given a cleaned line "Hb 13.5 g/dL"
    When I run the line parser
    Then the result has name "Hémoglobine", value 13.5, unit "g/dL"

  Scenario: Skip non-result lines (headers, footers, notes)
    Given a cleaned line "Laboratoire d'analyses médicales"
    When I run the line parser
    Then the result is null (no biological parameter found)

  Scenario: Handle percentage values
    Given a cleaned line "Hématocrite 42.5 %"
    When I run the line parser
    Then the result has name "Hématocrite", value 42.5, unit "%"
```

## Feature: Value plausibility validation

```gherkin
Feature: Value plausibility validation
  Flag values that are physiologically implausible (likely OCR errors).

  Scenario: Value within plausible range is not flagged
    Given an extracted result with name "Glycémie", value 0.95, unit "g/L"
    When I validate against the dictionary plausible range
    Then flagged is false

  Scenario: Value outside plausible range is flagged
    Given an extracted result with name "Glycémie", value 150, unit "g/L"
    When I validate against the dictionary plausible range
    Then flagged is true

  Scenario: Value at boundary of plausible range is not flagged
    Given an extracted result with name "Glycémie", value 5.0, unit "g/L"
    When I validate against the dictionary plausible range
    Then flagged is false

  Scenario: Negative value is flagged
    Given an extracted result with name "Créatinine", value -78, unit "µmol/L"
    When I validate against the dictionary plausible range
    Then flagged is true

  Scenario: Unknown parameter unit falls back to no flagging
    Given an extracted result with name "Glycémie", value 5.2, unit "unknown_unit"
    When I validate against the dictionary plausible range
    Then flagged is false
```

## Feature: Full pipeline integration

```gherkin
Feature: Full bio extraction pipeline
  End-to-end pipeline from raw OCR text to structured results.

  Scenario: Extract multiple parameters from multi-line OCR text
    Given raw OCR text:
      """
      Glycémie 0.95 g/L
      Créatinine 78 µmol/L
      Hémoglobine 13.5 g/dL
      """
    When I run the bio extraction pipeline
    Then I get 3 structured results
    And each result has name, value, unit, and flagged fields
    And none are flagged

  Scenario: Pipeline handles mixed valid and invalid lines
    Given raw OCR text:
      """
      Laboratoire XYZ
      Glycémie 0.95 g/L
      Date: 15/03/2024
      Créatinine 78 µmol/L
      """
    When I run the bio extraction pipeline
    Then I get 2 structured results (non-result lines skipped)

  Scenario: Pipeline flags implausible values
    Given raw OCR text:
      """
      Glycémie 150 g/L
      Créatinine 78 µmol/L
      """
    When I run the bio extraction pipeline
    Then I get 2 structured results
    And the "Glycémie" result has flagged=true
    And the "Créatinine" result has flagged=false

  Scenario: Pipeline output type matches BioResult interface
    When I run the bio extraction pipeline on any valid input
    Then each result matches the type { name: string; value: number; unit: string; flagged: boolean }
```

## Feature: Results display in UI

```gherkin
Feature: Bio results display in ResultsPanel
  Display structured bio results in a copy-friendly format.

  Scenario: Bio results are shown when available
    Given OCR results with bio-extractable text
    When the ResultsPanel renders
    Then a "Bio" section is visible showing extracted parameters

  Scenario: Each parameter is displayed on one line
    Given extracted bio results with 3 parameters
    When the bio results section renders
    Then each parameter shows "Name Value Unit" on a single line

  Scenario: Flagged values are visually highlighted
    Given an extracted bio result with flagged=true
    When the bio results section renders
    Then the flagged result has a visual warning indicator

  Scenario: Bio results are copy-friendly
    Given extracted bio results displayed in the panel
    When the user copies the bio results text
    Then the clipboard contains one line per parameter in "Name Value Unit" format
```

## Out of scope

- Auto-correction of flagged values (we flag, we don't fix)
- Multi-language support (French only)
- PDF table structure detection (we work on raw OCR text)
- Reference range extraction (we extract the value, not the reference range)
- Historical trend analysis across multiple lab reports
