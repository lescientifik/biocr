import type { BioResult } from "@/types/bio.ts";
import { cleanOcrText } from "./cleaner.ts";
import { parseLine } from "./line-parser.ts";
import { isValueFlagged } from "./validator.ts";

/**
 * Extracts structured biological parameters from raw OCR text.
 *
 * Pipeline:
 * 1. Clean OCR text (strip whitespace, remove artifacts, remove empty lines)
 * 2. Parse each line (identify parameter name, value, unit via dictionary lookup)
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
		const parsed = parseLine(line);
		if (!parsed) continue;

		results.push({
			name: parsed.param.name,
			value: parsed.value,
			unit: parsed.unit,
			flagged: isValueFlagged(parsed.param, parsed.value, parsed.unit),
		});
	}

	return results;
}
