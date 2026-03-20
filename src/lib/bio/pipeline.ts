import type { BioResult } from "@/types/bio.ts";
import { cleanOcrText } from "./cleaner.ts";
import { parseLineMulti } from "./line-parser.ts";
import { isValueFlagged } from "./validator.ts";

/**
 * Extracts structured biological parameters from raw OCR text.
 *
 * Pipeline:
 * 1. Clean OCR text (strip whitespace, remove artifacts, remove empty lines)
 * 2. Parse each line (identify parameter name, value, unit via dictionary lookup)
 *    Supports multi-value lines (e.g., "PNN 4.50 G/L 45 %")
 * 3. Validate each value against plausible ranges (flag implausible values)
 *
 * Returns an array of BioResult, one per successfully parsed parameter.
 * Lines that don't contain recognizable bio parameters are silently skipped.
 */
export function extractBioResults(rawText: string): BioResult[] {
	if (!rawText || rawText.trim().length === 0) return [];

	const cleaned = cleanOcrText(rawText);
	const lines = cleaned.split("\n");
	const results: BioResult[] = [];

	for (const line of lines) {
		const parsed = parseLineMulti(line);
		for (const p of parsed) {
			results.push({
				name: p.param.name,
				value: p.value,
				unit: p.unit,
				flagged: isValueFlagged(p.param, p.value, p.unit),
			});
		}
	}

	return results;
}
