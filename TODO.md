---
description: Pending improvements and feature ideas for the bio extraction pipeline.
---

# TODO

## Lab abnormality flags (*, H, L)

Lab reports use markers like `*`, `H` (high), `L` (low) next to values to indicate
results outside the laboratory's reference range. Currently the cleaner strips `*`
so parsing works, but we lose the information.

This is **distinct from the parser's `flagged` field** which flags values outside
physiologically plausible ranges (likely OCR errors). The lab flag means the value
is real but clinically abnormal per the lab's own reference range.

**Goal:** surface lab abnormality markers in the UI with a different visual treatment
than parser warnings (e.g. a colored indicator vs. a warning icon).

**Steps:**
- [ ] Add an `abnormal?: boolean` (or `"H" | "L" | "*"`) field to `BioResult`
- [ ] Detect `*`, `H`, `L` markers adjacent to values in the cleaner or parser
- [ ] Preserve the marker info through the pipeline instead of stripping it
- [ ] Display differently from `flagged` in the frontend
